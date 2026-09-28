import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AccountScreen from '../screens/AccountScreen';
import EnrollScreen from '../screens/EnrollScreen';
import LoginScreen from '../screens/LoginScreen';
import MonthScreen from '../screens/MonthScreen';
import PunchScreen from '../screens/PunchScreen';
import TodayScreen from '../screens/TodayScreen';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import type { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.card },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', color: colors.text, fontSize: 20 },
        tabBarActiveTintColor: colors.brandDark,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color, size }) => {
          const name =
            route.name === 'Punch'
              ? 'camera-outline'
              : route.name === 'Today'
                ? 'today-outline'
                : route.name === 'Month'
                  ? 'calendar-outline'
                  : 'person-circle-outline';
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Punch" component={PunchScreen} options={{ title: 'Punch', headerShown: false }} />
      <Tab.Screen name="Today" component={TodayScreen} options={{ title: 'Today' }} />
      <Tab.Screen name="Month" component={MonthScreen} options={{ title: 'Month' }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { token } = useAuth();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {token ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen
            name="Enroll"
            options={{ presentation: 'fullScreenModal', headerShown: false }}
          >
            {(props) => (
              <EnrollScreen
                onDone={() => props.navigation.goBack()}
                onCancel={() => props.navigation.goBack()}
              />
            )}
          </Stack.Screen>
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
