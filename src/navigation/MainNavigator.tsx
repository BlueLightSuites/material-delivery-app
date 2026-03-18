import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { User } from '../models/User';

// Common screens
import Profile from '../screens/Common/Profile';

// Driver screens
import JobsNearby from '../screens/Driver/JobsNearby';
import JobDetail from '../screens/Driver/JobDetail';
import Earnings from '../screens/Driver/Earnings';

// Contractor screens
import RequestList from '../screens/Contractor/RequestList';
import NewRequest from '../screens/Contractor/NewRequest';
import Tracking from '../screens/Contractor/Tracking';

export type MainStackParamList = {
  // Common
  Profile: undefined;
  
  // Driver
  JobsNearby: undefined;
  JobDetail: { jobId: string };
  Earnings: undefined;
  
  // Contractor
  RequestList: undefined;
  NewRequest: undefined;
  Tracking: { requestId: string };
};

const Stack = createStackNavigator<MainStackParamList>();

interface MainNavigatorProps {
  user: User | null;
}

const MainNavigator: React.FC<MainNavigatorProps> = ({ user }) => {
  const isDriver = user?.role === 'driver';
  const isContractor = user?.role === 'contractor';

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerTintColor: '#0066CC',
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
        },
      }}
    >
      {isDriver && (
        <>
          <Stack.Screen
            name="JobsNearby"
            component={JobsNearby}
            options={{
              title: 'Available Jobs',
            }}
          />
          <Stack.Screen
            name="JobDetail"
            component={JobDetail}
            options={{
              title: 'Job Details',
            }}
          />
          <Stack.Screen
            name="Earnings"
            component={Earnings}
            options={{
              title: 'My Earnings',
            }}
          />
        </>
      )}

      {isContractor && (
        <>
          <Stack.Screen
            name="RequestList"
            component={RequestList}
            options={{
              title: 'My Requests',
            }}
          />
          <Stack.Screen
            name="NewRequest"
            component={NewRequest}
            options={{
              title: 'New Request',
            }}
          />
          <Stack.Screen
            name="Tracking"
            component={Tracking}
            options={{
              title: 'Track Delivery',
            }}
          />
        </>
      )}

      <Stack.Screen
        name="Profile"
        component={Profile}
        options={{
          title: 'My Profile',
        }}
      />
    </Stack.Navigator>
  );
};

export default MainNavigator;
