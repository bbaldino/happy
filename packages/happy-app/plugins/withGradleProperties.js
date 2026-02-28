const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Config plugin to set Gradle JVM memory limits for Android builds.
 * Without this, builds can OOM on memory-constrained CI environments.
 */
const withCustomGradleProperties = (config) => {
    return withGradleProperties(config, (gradleConfig) => {
        // Remove any existing jvmargs entry to avoid duplicates
        gradleConfig.modResults = gradleConfig.modResults.filter(
            (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs')
        );
        // Set JVM max heap to 4GB
        gradleConfig.modResults.push({
            type: 'property',
            key: 'org.gradle.jvmargs',
            value: '-Xmx4g',
        });
        return gradleConfig;
    });
};

module.exports = withCustomGradleProperties;
