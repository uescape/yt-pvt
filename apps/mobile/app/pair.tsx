import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../src/api';
import { Button, ErrorText, Input, Muted, Screen, Section } from '../src/ui';

export default function Pair() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('Living room TV');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6 digits shown on the TV.');
    setBusy(true);
    try {
      await api.claimTv(code, name.trim() || 'TV');
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Muted style={{ marginBottom: 20, fontSize: 15 }}>
        Install Curato on your TV (Samsung, LG, Android TV / Google TV or Fire TV), open it, and type the code it shows.
      </Muted>
      <Section title="Code on the TV">
        <View style={{ padding: 12 }}>
          <Input
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            keyboardType="number-pad"
            autoFocus
            style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center', height: 64 }}
          />
        </View>
      </Section>
      <Section title="Name this TV">
        <View style={{ padding: 12 }}>
          <Input value={name} onChangeText={setName} maxLength={40} />
        </View>
      </Section>
      <ErrorText error={error} />
      <Button title="Connect TV" onPress={submit} loading={busy} disabled={code.length !== 6} />
    </Screen>
  );
}
