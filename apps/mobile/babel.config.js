module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // `jsxImportSource: 'nativewind'` é o que faz `className` existir em
      // componentes do React Native. Sem isso o NativeWind compila sem erro e
      // simplesmente nada fica estilizado.
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
