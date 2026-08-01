import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-3xl font-extrabold text-primary">Fatia</Text>
      <Text className="mt-2 text-muted-foreground">toolchain ok</Text>
    </View>
  );
}
