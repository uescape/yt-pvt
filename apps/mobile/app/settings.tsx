import type { HouseholdResponse } from '@curato/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { api, setToken } from '../src/api';
import { Button, ErrorText, Input, Loading, Muted, Screen, Section } from '../src/ui';

export default function Settings() {
  const [household, setHousehold] = useState<HouseholdResponse | null>(null);
  const [pin, setPin] = useState('');
  const [region, setRegion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .household()
      .then((h) => {
        setHousehold(h);
        setRegion(h.region);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!household) return error ? <ErrorText error={error} /> : <Loading />;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(done);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <Section title="Parent PIN" hint={household.hasPin ? 'A PIN is set.' : 'No PIN set: anyone can open grown-up profiles on the TV.'}>
        <View style={{ padding: 12 }}>
          <Input value={pin} onChangeText={setPin} placeholder="New PIN (4–8 digits)" keyboardType="number-pad" secureTextEntry maxLength={8} />
        </View>
      </Section>
      <Button
        title="Change PIN"
        disabled={!/^\d{4,8}$/.test(pin)}
        onPress={() =>
          run(async () => {
            await api.updateHousehold({ pin });
            setPin('');
          }, 'PIN updated.')
        }
      />

      <View style={{ height: 24 }} />
      <Section title="Country" hint="Used for trending videos and region-restricted content (2-letter code, e.g. PK, US, GB).">
        <View style={{ padding: 12 }}>
          <Input value={region} onChangeText={(t) => setRegion(t.toUpperCase().slice(0, 2))} autoCapitalize="characters" maxLength={2} />
        </View>
      </Section>
      <Button title="Save country" disabled={!/^[A-Z]{2}$/.test(region)} onPress={() => run(() => api.updateHousehold({ region }), 'Country saved.')} />

      <ErrorText error={error} />
      {message ? <Muted style={{ marginTop: 8 }}>{message}</Muted> : null}

      <View style={{ height: 40 }} />
      <Button
        title="Sign out of this phone"
        variant="danger"
        onPress={() =>
          Alert.alert(
            'Sign out?',
            'This phone will lose access to your profiles and TVs. In this version there is no account recovery, so only do this if you are setting Curato up again.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign out',
                style: 'destructive',
                onPress: async () => {
                  await setToken(null);
                  router.replace('/welcome');
                },
              },
            ],
          )
        }
      />
      <Muted style={{ marginTop: 24, textAlign: 'center', fontSize: 12 }}>
        Curato uses YouTube API Services. By using it you agree to the YouTube Terms of Service (youtube.com/t/terms) and Google’s Privacy Policy
        (policies.google.com/privacy). Curato is not affiliated with YouTube or Google.
      </Muted>
    </Screen>
  );
}
