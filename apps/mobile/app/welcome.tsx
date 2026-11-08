import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, setToken } from '../src/api';
import { Button, ErrorText, Input, Muted, Section, Title, useColors } from '../src/ui';

/** First launch: create the household and the parent PIN that guards the TV. */
export default function Welcome() {
  const c = useColors();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const region = (getLocales()[0]?.regionCode ?? 'US').toUpperCase();

  const create = async () => {
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) return setError('Choose a PIN of 4–8 digits.');
    if (pin !== confirm) return setError('The PINs don’t match.');
    setBusy(true);
    try {
      const res = await api.createHousehold({ region, pin, deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android phone' });
      await setToken(res.token);
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
        <Title>Welcome to Curato</Title>
        <Muted style={{ marginBottom: 24, fontSize: 16, lineHeight: 22 }}>
          Choose exactly what your TV can show: only the channels you trust, no Shorts, no endless autoplay. You set the rules here; the TV
          follows them.
        </Muted>
        <Section title="Parent PIN" hint="Needed on the TV to open grown-up profiles or settings. Kids profiles open without it.">
          <View style={{ padding: 12 }}>
            <Input value={pin} onChangeText={setPin} placeholder="PIN (4–8 digits)" keyboardType="number-pad" secureTextEntry maxLength={8} />
            <View style={{ height: 10 }} />
            <Input value={confirm} onChangeText={setConfirm} placeholder="Repeat PIN" keyboardType="number-pad" secureTextEntry maxLength={8} />
          </View>
        </Section>
        <ErrorText error={error} />
        <Button title="Get started" onPress={create} loading={busy} />
        <Muted style={{ marginTop: 16, textAlign: 'center', fontSize: 12 }}>
          Videos play in YouTube’s official player, ads included. Curato is not affiliated with YouTube or Google.
        </Muted>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
