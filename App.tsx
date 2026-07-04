import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Platform, PermissionsAndroid } from 'react-native';
import { WebView } from 'react-native-webview';

const WEB_URL = 'https://livme-app.pages.dev';

export default function App() {
  const [ready, setReady] = useState(Platform.OS !== 'android');

  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]).then(() => setReady(true));
    }
  }, []);

  if (!ready) {
    return (
      <View style={s.container}>
        <Text style={s.loading}>Requesting permissions...</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <WebView
        source={{ uri: WEB_URL }}
        style={s.webview}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowFileAccess
        originWhitelist={['*']}
        onPermissionRequest={(req: any) => req.grant(req.getResources())}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  webview: { flex: 1 },
  loading: { color: '#fff', fontSize: 18, textAlign: 'center', marginTop: 100 },
});
