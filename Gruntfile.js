module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jsdoc : {
            dist : {
                src: ['src/*.js', 'test/*.js', 'README.md'],
                options: {
                    destination : 'docs',
                    template : "node_modules/docdash"
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-jsdoc');
    
    grunt.registerTask('default', []);

    grunt.registerTask('docs', ['jsdoc']);
};