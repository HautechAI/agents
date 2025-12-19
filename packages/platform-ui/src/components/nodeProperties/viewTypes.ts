import type { NodePropertiesSidebarProps } from './types';

export interface NodePropertiesViewProps extends NodePropertiesSidebarProps {
  secretSuggestions: string[];
  variableSuggestions: string[];
}

export type NodePropertiesViewComponent = (props: NodePropertiesViewProps) => JSX.Element | null;
