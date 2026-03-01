const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Config plugin to set Gradle JVM and worker memory limits for Android builds.
 *
 * Key settings:
 * - org.gradle.jvmargs: Heap for the Gradle daemon itself (4GB)
 * - org.gradle.workers.max: Limits parallel workers to reduce peak memory
 * - dex-in-process: Runs D8 dexer inside the Gradle daemon's JVM instead of
 *   spawning separate worker processes, so it shares the 4GB heap. Without
 *   this, D8 workers get a small default heap and OOM on large projects.
 */
const withCustomGradleProperties = (config) => {
    return withGradleProperties(config, (gradleConfig) => {
        const propertiesToSet = {
            // Gradle daemon heap — 4GB is enough for D8 in-process
            'org.gradle.jvmargs': '-Xmx4g -XX:+HeapDumpOnOutOfMemoryError',
            // Limit parallel workers to reduce peak memory usage
            'org.gradle.workers.max': '2',
            // Use full classpath for dexing transforms — reduces memory pressure
            // by avoiding redundant class resolution in worker processes.
            'android.useFullClasspathForDexingTransform': 'true',
        };

        // Remove existing entries for any properties we're setting
        const keysToSet = new Set(Object.keys(propertiesToSet));
        gradleConfig.modResults = gradleConfig.modResults.filter(
            (item) => !(item.type === 'property' && keysToSet.has(item.key))
        );

        // Add our properties
        for (const [key, value] of Object.entries(propertiesToSet)) {
            gradleConfig.modResults.push({
                type: 'property',
                key,
                value,
            });
        }

        return gradleConfig;
    });
};

module.exports = withCustomGradleProperties;
