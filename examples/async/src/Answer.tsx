import * as React from 'react';
import { FC } from 'react';

interface AnswerProps {
    disabled: boolean;
    answer: string;
    image: string;
    error: string;
}

export const Answer: FC<AnswerProps> = ({
    disabled,
    answer,
    image,
    error,
}) => {
    if (disabled) {
        return null;
    }

    if (error) {
        return (
            <div>Error: { error }</div>
        );
    }

    return (
        <div>
            <p>{ answer }</p>
            <img src={image} />
        </div>
    );
};
