import { View, Text, StyleSheet } from 'react-native';

// TODO (Week 3): implement QR scanner with expo-camera + offline queue
export default function ScanScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>QR Scanner</Text>
      <Text style={styles.subtitle}>Camera + offline mode — coming in Week 3</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
});
