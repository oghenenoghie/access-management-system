// Expo config plugin: signs release builds with the key described in
// mobile-expo/release-signing.properties (git-ignored; see docs/DEPLOYMENT.md).
// `expo prebuild` regenerates android/, so the signing setup lives here
// instead of in a hand-edited build.gradle. Without the properties file,
// release builds keep Expo's default debug signing.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// @generated withReleaseSigning";

const GROOVY = `
${MARKER}
def releaseSigningFile = rootProject.file("../release-signing.properties")
if (releaseSigningFile.exists()) {
    def releaseSigning = new Properties()
    releaseSigningFile.withInputStream { releaseSigning.load(it) }
    android.signingConfigs.create("release") {
        storeFile file(releaseSigning["storeFile"])
        storePassword releaseSigning["storePassword"]
        keyAlias releaseSigning["keyAlias"]
        keyPassword releaseSigning["keyPassword"]
    }
    android.buildTypes.release.signingConfig android.signingConfigs.release
}
`;

const KOTLIN = `
${MARKER}
val releaseSigningFile = rootProject.file("../release-signing.properties")
if (releaseSigningFile.exists()) {
    val releaseSigning = java.util.Properties()
    releaseSigningFile.inputStream().use { releaseSigning.load(it) }
    android.signingConfigs.create("release") {
        storeFile = file(releaseSigning.getProperty("storeFile"))
        storePassword = releaseSigning.getProperty("storePassword")
        keyAlias = releaseSigning.getProperty("keyAlias")
        keyPassword = releaseSigning.getProperty("keyPassword")
    }
    android.buildTypes.getByName("release").signingConfig = android.signingConfigs.getByName("release")
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults;
    if (!gradle.contents.includes(MARKER)) {
      gradle.contents += gradle.language === "kt" ? KOTLIN : GROOVY;
    }
    return cfg;
  });
};
