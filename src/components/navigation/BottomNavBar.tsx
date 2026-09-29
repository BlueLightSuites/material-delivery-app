import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainStackParamList } from '../../navigation/MainNavigator';

type Navigation = StackNavigationProp<MainStackParamList>;

interface NavTab<K extends string> {
  key: K;
  icon: string;
  label: string;
  go: (navigation: Navigation) => void;
}

// One definition per role. Every screen in a role's stack used to build
// its own copy of this array, and a tab removed from one copy lived on
// in another - which is how a hardcoded Tracking tab kept crashing the
// request list after it had been "removed".
const CONTRACTOR_TABS = [
  { key: 'requests', icon: '📋', label: 'Requests', go: (n) => n.navigate('RequestList') },
  { key: 'new', icon: '➕', label: 'New', go: (n) => n.navigate('NewRequest', { requestId: undefined }) },
  { key: 'profile', icon: '👤', label: 'Profile', go: (n) => n.navigate('Profile') },
] as const satisfies readonly NavTab<string>[];

const DRIVER_TABS = [
  { key: 'jobs', icon: '🚚', label: 'Jobs', go: (n) => n.navigate('JobsNearby') },
  { key: 'earnings', icon: '💰', label: 'Earnings', go: (n) => n.navigate('Earnings') },
  { key: 'profile', icon: '👤', label: 'Profile', go: (n) => n.navigate('Profile') },
] as const satisfies readonly NavTab<string>[];

type ContractorTab = (typeof CONTRACTOR_TABS)[number]['key'];
type DriverTab = (typeof DRIVER_TABS)[number]['key'];

/**
 * `active` is the tab a screen belongs to, not necessarily one it was
 * reached from directly - Tracking sits under Requests, JobDetail under
 * Jobs.
 */
type BottomNavBarProps =
  | { role: 'contractor'; active: ContractorTab }
  | { role: 'driver'; active: DriverTab };

/**
 * Shared bottom tab bar, drawn the same way on every top-level screen in a
 * role's stack (contractor: Requests/New/Profile, driver:
 * Jobs/Earnings/Profile) so Profile - and the logout button on it - is
 * always one tap away instead of only reachable from one screen.
 */
const BottomNavBar: React.FC<BottomNavBarProps> = ({ role, active }) => {
  const navigation = useNavigation<Navigation>();
  const tabs: readonly NavTab<string>[] = role === 'contractor' ? CONTRACTOR_TABS : DRIVER_TABS;

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.navItem}
            onPress={() => tab.go(navigation)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={styles.navIcon}>{tab.icon}</Text>
            <Text style={[styles.navLabel, selected && styles.navLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingBottom: 16,
    paddingHorizontal: 8,
    paddingTop: 12,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  navIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666666',
    textAlign: 'center',
  },
  navLabelActive: {
    color: '#0066CC',
    fontWeight: '700',
  },
});

export default BottomNavBar;
