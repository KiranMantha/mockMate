export type ApiType = 'rest' | 'graphql';
export type HttpMethod = '*' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ResponseType = 'static' | 'dynamic';

export type MockRule = {
  id: string;
  groupId?: string;
  name: string;
  type: ApiType;
  method: HttpMethod;
  urlPattern: string;
  graphqlOperation: string;
  responseType: ResponseType;
  responseBody: string;
  dynamicCode: string;
  statusCode: string;
  delay: string;
  headers: Record<string, string>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type RuleGroup = {
  id: string;
  name: string;
  enabled: boolean;
};

export type StorageData = {
  mockRules: MockRule[];
  mockEnabled: boolean;
};
