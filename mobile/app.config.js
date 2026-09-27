// app.json holds the config. This only lets one person build with their own free Apple ID:
// Apple lets a bundle identifier belong to one team, so teammates on personal teams each need their own,
// e.g. `IOS_BUNDLE_ID=com.formalconnection.app.adam npx expo run:ios --device`. Unset: app.json's id.
module.exports = ({ config }) => {
  const id = (process.env.IOS_BUNDLE_ID || '').trim();
  return id ? { ...config, ios: { ...config.ios, bundleIdentifier: id } } : config;
};
