import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  return (
    <View style={s.container}>
      <WebView
        source={{ uri: 'https://aquamarine-sable-cd0178.netlify.app' }}
        style={s.webview}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});
