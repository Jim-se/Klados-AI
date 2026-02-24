import React, { createContext, useContext } from 'react';
import { ChatNode } from '../../types';

export const NodeDataContext = createContext<Record<string, ChatNode>>({});

export const useNodeData = () => {
    return useContext(NodeDataContext);
};
