const fs = require('fs');
const path = '/Users/gim-yeongtae/Downloads/camter_poooling/camter-rn/android/build.gradle';

try {
    let content = fs.readFileSync(path, 'utf8');

    if (!content.includes('devrepo.kakao.com')) {
        console.log('Adding Kakao repository...');
        content = content.replace(
            "maven { url 'https://www.jitpack.io' }",
            "maven { url 'https://www.jitpack.io' }\n        maven { url 'https://devrepo.kakao.com/nexus/content/groups/public/' }"
        );
        fs.writeFileSync(path, content, 'utf8');
        console.log('Successfully updated build.gradle');
    } else {
        console.log('Kakao repository already exists.');
    }
} catch (error) {
    console.error('Error updating build.gradle:', error);
    process.exit(1);
}
