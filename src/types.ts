export interface PluginSearchResult {
  id: number;
  name: string;
  tag: string;
  icon?: {
    url: string;
  };
}

export interface PermissionNode {
  node: string;
  description: string;
  category: 'admin' | 'user';
}

export interface CommandInfo {
  command: string;
  description: string;
  permission?: string;
  category: 'admin' | 'user';
}

export interface PlaceholderInfo {
  placeholder: string;
  description: string;
}

export interface ExtractionResult {
  permissions: PermissionNode[];
  commands: CommandInfo[];
  placeholders: PlaceholderInfo[];
}

export interface ExtractionStatus {
  step: string;
  progress: number;
  message: string;
}
