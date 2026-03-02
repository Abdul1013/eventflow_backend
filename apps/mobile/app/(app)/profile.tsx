import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { useScannerStore } from '@/src/store/scannerStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ─── Role badge config ────────────────────────────────────────────────────────

const ROLE_STYLE: Record<string, { bg: string; text: string }> = {
  ADMIN:    { bg: '#fef2f2', text: '#dc2626' }, // red
  STAFF:    { bg: '#eef2ff', text: '#4f46e5' }, // indigo
  ATTENDEE: { bg: '#f3f4f6', text: '#6b7280' }, // gray
};

// ─── ProfileScreen ────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, clearAuth } = useAuthStore();
  const { clearActiveEvent } = useScannerStore();

  const initials = getInitials(user?.name);
  const role = user?.role ?? '';
  const roleStyle = ROLE_STYLE[role] ?? { bg: '#f3f4f6', text: '#6b7280' };
  const appVersion = Constants.expoConfig?.version ?? '—';

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await api.post('/auth/logout');
              } catch {
                // Clear local state regardless of server response
              }
              clearAuth();
              clearActiveEvent();
              router.replace('/(auth)/login');
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.content}>
        {/* ── User card ── */}
        <View style={styles.card}>
          {/* Avatar circle with initials */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <Text style={styles.name}>{user?.name ?? '—'}</Text>
          <Text style={styles.email}>{user?.email ?? '—'}</Text>

          {/* Role badge — ADMIN=red, STAFF=indigo */}
          <View style={[styles.roleBadge, { backgroundColor: roleStyle.bg }]}>
            <Text style={[styles.roleText, { color: roleStyle.text }]}>
              {role || '—'}
            </Text>
          </View>
        </View>

        {/* ── Sign out button ── */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* ── App version (very bottom) ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.version}>EventFlow v{appVersion}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },

  header: {
    backgroundColor: 'white',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 8,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },

  content: { flex: 1, padding: 20, gap: 14 },

  // User card
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    padding: 24,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#4f46e5' },
  name:       { fontSize: 20, fontWeight: '700', color: '#111827' },
  email:      { fontSize: 14, color: '#6b7280', marginTop: 2 },
  roleBadge:  { marginTop: 10, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  roleText:   { fontSize: 12, fontWeight: '600' },

  // Sign out
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 14,
    paddingVertical: 15,
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },

  // App version footer
  footer:  { alignItems: 'center', paddingTop: 8 },
  version: { fontSize: 12, color: '#d1d5db' },
});
