import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const WEB_URL = 'https://aquamarine-sable-cd0178.netlify.app';

export default function App() {
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
  container: { flex: 1 },
  webview: { flex: 1 },
});
