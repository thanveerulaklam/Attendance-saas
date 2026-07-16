import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Scan: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Today: undefined;
  Month: undefined;
  Profile: undefined;
};
