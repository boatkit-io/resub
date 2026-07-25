const INCORRECT_STATE_ACCESS_MESSAGE = 'this.state is undefined in UNSAFE_componentWillMount callback.';
const MISSING_SUPER_CALL = 'Method override must call super.{{methodName}}';
const MISSING_TOP_LEVEL_SUPER_CALL = 'Method override must call super.{{methodName}} in the top-level statements of the method body';
const INVALID_STATE_KEYPATH = 'ReSub key "{{key}}" must match a field path on this.{{statePropertyName}}.';
const UNCHECKABLE_STATE_KEYPATH = 'ReSub key must be a literal, enum member, static constant, formCompoundKey(...), or array of those so it can be checked against this.{{statePropertyName}}.';
const COMPOUND_KEY_JOINER = '%&';
const STORE_BASE_KEY_ALL = '%!$all';
const UNKNOWN_SEGMENT = '*';

function getStaticPropertyName(node) {
    if (!node) {
        return undefined;
    }

    if (node.type === 'Identifier' || node.type === 'PrivateIdentifier') {
        return node.name;
    }

    if (node.type === 'Literal') {
        return String(node.value);
    }

    return undefined;
}

function getMemberPropertyName(node) {
    if (node.computed) {
        return node.property.type === 'Literal' ? String(node.property.value) : undefined;
    }

    return getStaticPropertyName(node.property);
}

function isMethodLikeClassElement(node) {
    return node && (node.type === 'MethodDefinition' || node.type === 'TSAbstractMethodDefinition') && node.value && node.value.body;
}

function isThisMethodCall(node) {
    return node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'ThisExpression' &&
        !!getMemberPropertyName(node.callee);
}

function isThisStateMember(node) {
    return node.type === 'MemberExpression' &&
        node.object.type === 'ThisExpression' &&
        getMemberPropertyName(node) === 'state';
}

function containsThisStateAccess(node) {
    for (let current = node; current && current.type === 'MemberExpression'; current = current.object) {
        if (isThisStateMember(current)) {
            return true;
        }
    }

    return false;
}

function isSuperMethodCall(node, methodName) {
    return node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Super' &&
        getMemberPropertyName(node.callee) === methodName;
}

function visitChildNodes(node, visitor) {
    if (!node || typeof node.type !== 'string') {
        return;
    }

    const shouldVisitChildren = visitor(node) !== false;
    if (!shouldVisitChildren) {
        return;
    }

    for (const key of Object.keys(node)) {
        if (key === 'parent' || key === 'loc' || key === 'range' || key === 'tokens' || key === 'comments') {
            continue;
        }

        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) {
                visitChildNodes(child, visitor);
            }
        } else if (value && typeof value.type === 'string') {
            visitChildNodes(value, visitor);
        }
    }
}

function getTemplateLiteralValue(node) {
    if (node.expressions.length > 0) {
        return undefined;
    }

    return node.quasis.map(quasi => quasi.value.cooked).join('');
}

function getLiteralValue(node) {
    if (!node) {
        return undefined;
    }

    if (node.type === 'Literal' && (typeof node.value === 'string' || typeof node.value === 'number')) {
        return node.value;
    }

    if (node.type === 'TemplateLiteral') {
        return getTemplateLiteralValue(node);
    }

    return undefined;
}

function getLiteralArrayValue(node) {
    if (!node || node.type !== 'ArrayExpression') {
        return undefined;
    }

    const values = [];
    for (const element of node.elements) {
        const value = getLiteralValue(element);
        if (value === undefined) {
            return undefined;
        }

        values.push(value);
    }

    return values;
}

function getPropertyConstantKey(node) {
    if (node.type !== 'MemberExpression') {
        return undefined;
    }

    const propertyName = getMemberPropertyName(node);
    if (!propertyName) {
        return undefined;
    }

    if (node.object.type === 'Identifier') {
        return `${ node.object.name }.${ propertyName }`;
    }

    return undefined;
}

function getConstantValue(node, constants) {
    const literalValue = getLiteralValue(node);
    if (literalValue !== undefined) {
        return literalValue;
    }

    const arrayValue = getLiteralArrayValue(node);
    if (arrayValue) {
        return arrayValue;
    }

    if (node.type === 'Identifier') {
        return constants.get(node.name);
    }

    const propertyConstantKey = getPropertyConstantKey(node);
    if (propertyConstantKey) {
        return constants.get(propertyConstantKey);
    }

    return undefined;
}

function collectConstants(program) {
    const constants = new Map();

    visitChildNodes(program, node => {
        if (node.type === 'VariableDeclaration' && node.kind === 'const') {
            for (const declaration of node.declarations) {
                if (declaration.id.type !== 'Identifier' || !declaration.init) {
                    continue;
                }

                const value = getLiteralValue(declaration.init) ?? getLiteralArrayValue(declaration.init);
                if (value !== undefined) {
                    constants.set(declaration.id.name, value);
                }
            }
        }

        if (node.type === 'TSEnumDeclaration') {
            let nextNumericValue = 0;
            for (const member of node.members) {
                const memberName = getStaticPropertyName(member.id);
                if (!memberName) {
                    continue;
                }

                const value = member.initializer ? getLiteralValue(member.initializer) : nextNumericValue;
                if (value !== undefined) {
                    constants.set(`${ node.id.name }.${ memberName }`, value);
                }

                nextNumericValue = typeof value === 'number' ? value + 1 : nextNumericValue + 1;
            }
        }

        if ((node.type === 'ClassDeclaration' || node.type === 'ClassExpression') && node.id) {
            for (const element of node.body.body) {
                if (!element.static || !element.value) {
                    continue;
                }

                const propertyName = getStaticPropertyName(element.key);
                if (!propertyName) {
                    continue;
                }

                const value = getLiteralValue(element.value) ?? getLiteralArrayValue(element.value);
                if (value !== undefined) {
                    constants.set(`${ node.id.name }.${ propertyName }`, value);
                }
            }
        }

        return true;
    });

    return constants;
}

function isStoreBaseKeyAllExpression(node) {
    const value = getLiteralValue(node);
    if (value === STORE_BASE_KEY_ALL) {
        return true;
    }

    return node &&
        node.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        node.object.name === 'StoreBase' &&
        getMemberPropertyName(node) === 'Key_All';
}

function splitKeyPathString(value) {
    return String(value)
        .split(COMPOUND_KEY_JOINER)
        .flatMap(part => part.split('.'))
        .filter(Boolean);
}

function isNamedCall(node, functionName) {
    if (node.type !== 'CallExpression') {
        return false;
    }

    if (node.callee.type === 'Identifier') {
        return node.callee.name === functionName;
    }

    return node.callee.type === 'MemberExpression' &&
        getMemberPropertyName(node.callee) === functionName;
}

function isFormCompoundKeyCall(node) {
    return isNamedCall(node, 'formCompoundKey');
}

function isKeyArgCall(node) {
    return isNamedCall(node, 'keyArg');
}

function isKeyPathCall(node) {
    return isNamedCall(node, 'keyPath');
}

function getKeyPathsFromExpression(node, constants) {
    if (!node || isStoreBaseKeyAllExpression(node)) {
        return { kind: 'skip', paths: [] };
    }

    if (node.type === 'ArrayExpression') {
        const paths = [];
        for (const element of node.elements) {
            const result = getKeyPathsFromExpression(element, constants);
            if (result.kind === 'unknown') {
                return result;
            }

            paths.push(...result.paths);
        }

        return { kind: 'ok', paths };
    }

    if (isKeyPathCall(node)) {
        if (node.arguments.length === 0) {
            return { kind: 'unknown', paths: [] };
        }

        const path = [];
        for (const argument of node.arguments) {
            if (!argument || argument.type === 'SpreadElement') {
                return { kind: 'unknown', paths: [] };
            }

            if (isKeyArgCall(argument)) {
                path.push(UNKNOWN_SEGMENT);
                continue;
            }

            const value = getConstantValue(argument, constants);
            path.push(...(value === undefined ? [UNKNOWN_SEGMENT] : splitKeyPathString(value)));
        }

        return { kind: 'ok', paths: [path] };
    }

    if (isFormCompoundKeyCall(node)) {
        const path = [];
        for (const argument of node.arguments) {
            if (!argument || argument.type === 'SpreadElement') {
                return { kind: 'unknown', paths: [] };
            }

            const value = getConstantValue(argument, constants);
            path.push(...(value === undefined ? [UNKNOWN_SEGMENT] : splitKeyPathString(value)));
        }

        return { kind: 'ok', paths: [path] };
    }

    const value = getConstantValue(node, constants);
    if (Array.isArray(value)) {
        return { kind: 'ok', paths: value.map(splitKeyPathString) };
    }

    if (value !== undefined) {
        return { kind: 'ok', paths: [splitKeyPathString(value)] };
    }

    return { kind: 'unknown', paths: [] };
}

function getThisStatePath(node, statePropertyName) {
    if (!node || node.type !== 'MemberExpression') {
        return undefined;
    }

    if (node.object.type === 'ThisExpression' && getMemberPropertyName(node) === statePropertyName) {
        return [];
    }

    const objectPath = getThisStatePath(node.object, statePropertyName);
    if (!objectPath) {
        return undefined;
    }

    if (node.computed && node.property.type !== 'Literal') {
        return [...objectPath, UNKNOWN_SEGMENT];
    }

    const propertyName = getMemberPropertyName(node);
    if (!propertyName) {
        return [...objectPath, UNKNOWN_SEGMENT];
    }

    return [...objectPath, propertyName];
}

function collectStatePaths(classBody, statePropertyName) {
    const statePaths = [];

    visitChildNodes(classBody, node => {
        if (node.type === 'MemberExpression') {
            const path = getThisStatePath(node, statePropertyName);
            if (path && path.length > 0 && path[path.length - 1] !== UNKNOWN_SEGMENT) {
                statePaths.push(path);
            }
        }

        return true;
    });

    return statePaths;
}

function statePathMatchesKeyPath(statePath, keyPath) {
    if (keyPath.length === 0 || keyPath.length > statePath.length) {
        return false;
    }

    const offset = statePath.length - keyPath.length;
    for (let index = 0; index < keyPath.length; index++) {
        const stateSegment = statePath[offset + index];
        const keySegment = keyPath[index];
        if (stateSegment !== UNKNOWN_SEGMENT && keySegment !== UNKNOWN_SEGMENT && stateSegment !== keySegment) {
            return false;
        }
    }

    return true;
}

function isValidStateKeyPath(keyPath, statePaths) {
    return statePaths.some(statePath => statePathMatchesKeyPath(statePath, keyPath));
}

function formatKeyPath(keyPath) {
    return keyPath.join('.');
}

function analyzeMethod(method) {
    const calledMethods = [];
    const stateAccessNodes = [];

    visitChildNodes(method.value.body, node => {
        if (node.type === 'MemberExpression' && containsThisStateAccess(node)) {
            stateAccessNodes.push(node);
            return false;
        }

        if (isThisMethodCall(node)) {
            calledMethods.push(getMemberPropertyName(node.callee));
        }

        return true;
    });

    return {
        calledMethods,
        stateAccessNodes,
    };
}

const incorrectStateAccess = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow this.state access from UNSAFE_componentWillMount and configured call graph roots.',
        },
        schema: {
            type: 'array',
            items: {
                type: 'string',
            },
            uniqueItems: true,
        },
        messages: {
            incorrectStateAccess: INCORRECT_STATE_ACCESS_MESSAGE,
        },
    },
    create(context) {
        return {
            ClassBody(node) {
                const methods = new Map();

                for (const element of node.body) {
                    if (isMethodLikeClassElement(element)) {
                        const methodName = getStaticPropertyName(element.key);
                        if (methodName) {
                            methods.set(methodName, analyzeMethod(element));
                        }
                    }
                }

                const methodNamesToCheck = [...context.options, 'UNSAFE_componentWillMount'];
                const visitedMethods = new Set();
                const queue = methodNamesToCheck
                    .map(methodName => methods.get(methodName))
                    .filter(Boolean);

                while (queue.length > 0) {
                    const method = queue.pop();
                    if (!method || visitedMethods.has(method)) {
                        continue;
                    }

                    visitedMethods.add(method);

                    for (const stateAccessNode of method.stateAccessNodes) {
                        context.report({
                            node: stateAccessNode,
                            messageId: 'incorrectStateAccess',
                        });
                    }

                    for (const calledMethodName of method.calledMethods) {
                        const calledMethod = methods.get(calledMethodName);
                        if (calledMethod) {
                            queue.push(calledMethod);
                        }
                    }
                }
            },
        };
    },
};

function hasTopLevelSuperCall(method, methodName) {
    return method.value.body.body.some(statement => (
        statement.type === 'ExpressionStatement' && isSuperMethodCall(statement.expression, methodName)
    ));
}

function hasSuperCall(method, methodName) {
    let found = false;
    visitChildNodes(method.value.body, node => {
        if (isSuperMethodCall(node, methodName)) {
            found = true;
            return false;
        }

        return true;
    });
    return found;
}

const overrideCallsSuper = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require configured override methods to call the matching super method at top level.',
        },
        schema: {
            type: 'array',
            items: {
                type: 'string',
            },
            uniqueItems: true,
        },
        messages: {
            missingSuperCall: MISSING_SUPER_CALL,
            missingTopLevelSuperCall: MISSING_TOP_LEVEL_SUPER_CALL,
        },
    },
    create(context) {
        const methodNamesToCheck = new Set(context.options);

        return {
            MethodDefinition(node) {
                const methodName = getStaticPropertyName(node.key);
                if (!methodName || !methodNamesToCheck.has(methodName) || !node.value.body) {
                    return;
                }

                if (hasTopLevelSuperCall(node, methodName)) {
                    return;
                }

                context.report({
                    node,
                    messageId: hasSuperCall(node, methodName) ? 'missingTopLevelSuperCall' : 'missingSuperCall',
                    data: {
                        methodName,
                    },
                });
            },
        };
    },
};

function getAutoSubscribeWithKeyDecorators(element) {
    const decorators = element.decorators || element.value?.decorators || [];
    return decorators.filter(decorator => {
        const expression = decorator.expression;
        if (!expression || expression.type !== 'CallExpression') {
            return false;
        }

        if (expression.callee.type === 'Identifier') {
            return expression.callee.name === 'autoSubscribeWithKey';
        }

        return expression.callee.type === 'MemberExpression' &&
            getMemberPropertyName(expression.callee) === 'autoSubscribeWithKey';
    });
}

function isAutoSubscribeOptionsExpression(node) {
    return node?.type === 'ObjectExpression';
}

function validateStateKeyExpression(context, node, statePaths, constants, statePropertyName, allowDynamicKeys) {
    const result = getKeyPathsFromExpression(node, constants);
    if (result.kind === 'skip') {
        return;
    }

    if (result.kind === 'unknown') {
        if (!allowDynamicKeys) {
            context.report({
                node,
                messageId: 'uncheckableStateKeypath',
                data: {
                    statePropertyName,
                },
            });
        }

        return;
    }

    for (const keyPath of result.paths) {
        if (!isValidStateKeyPath(keyPath, statePaths)) {
            context.report({
                node,
                messageId: 'invalidStateKeypath',
                data: {
                    key: formatKeyPath(keyPath),
                    statePropertyName,
                },
            });
        }
    }
}

function validateStateKeyCall(context, node, statePaths, constants, statePropertyName, allowDynamicKeys) {
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') {
        return;
    }

    if (node.callee.object.type !== 'ThisExpression') {
        return;
    }

    const methodName = getMemberPropertyName(node.callee);
    if (methodName === 'trigger') {
        validateStateKeyExpression(context, node.arguments[0], statePaths, constants, statePropertyName, allowDynamicKeys);
    } else if (methodName === 'subscribe' && node.arguments.length > 1) {
        validateStateKeyExpression(context, node.arguments[1], statePaths, constants, statePropertyName, allowDynamicKeys);
    }
}

const stateKeypaths = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require ReSub trigger and subscription keys to match field paths on the store state.',
        },
        schema: [{
            type: 'object',
            properties: {
                allowDynamicKeys: {
                    type: 'boolean',
                },
                statePropertyName: {
                    type: 'string',
                },
            },
            additionalProperties: false,
        }],
        messages: {
            invalidStateKeypath: INVALID_STATE_KEYPATH,
            uncheckableStateKeypath: UNCHECKABLE_STATE_KEYPATH,
        },
    },
    create(context) {
        const options = context.options[0] || {};
        const allowDynamicKeys = options.allowDynamicKeys === true;
        const statePropertyName = options.statePropertyName || '_state';
        const constants = collectConstants(context.sourceCode.ast);

        return {
            ClassBody(node) {
                const statePaths = collectStatePaths(node, statePropertyName);
                if (statePaths.length === 0) {
                    return;
                }

                for (const element of node.body) {
                    for (const decorator of getAutoSubscribeWithKeyDecorators(element)) {
                        for (const argument of decorator.expression.arguments) {
                            if (!argument || argument.type === 'SpreadElement' || isAutoSubscribeOptionsExpression(argument)) {
                                continue;
                            }

                            validateStateKeyExpression(
                                context,
                                argument,
                                statePaths,
                                constants,
                                statePropertyName,
                                allowDynamicKeys,
                            );
                        }
                    }

                    if (isMethodLikeClassElement(element)) {
                        visitChildNodes(element.value.body, child => {
                            validateStateKeyCall(context, child, statePaths, constants, statePropertyName, allowDynamicKeys);
                            return true;
                        });
                    }
                }
            },
        };
    },
};

export const rules = {
    'incorrect-state-access': incorrectStateAccess,
    'override-calls-super': overrideCallsSuper,
    'state-keypaths': stateKeypaths,
};

export default {
    meta: {
        name: 'resub',
    },
    rules,
};
