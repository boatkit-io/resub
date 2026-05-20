const INCORRECT_STATE_ACCESS_MESSAGE = 'this.state is undefined in UNSAFE_componentWillMount callback.';
const MISSING_SUPER_CALL = 'Method override must call super.{{methodName}}';
const MISSING_TOP_LEVEL_SUPER_CALL = 'Method override must call super.{{methodName}} in the top-level statements of the method body';

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

export const rules = {
    'incorrect-state-access': incorrectStateAccess,
    'override-calls-super': overrideCallsSuper,
};

export default {
    meta: {
        name: 'resub',
    },
    rules,
};
