module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jsdoc : {
            dist : {
                src: ['src/*.js', 'test/*.js', 'README.md'],
                options: {
                    destination : 'doc',
                       template : "node_modules/ink-docstrap/template",
                      configure : "node_modules/ink-docstrap/template/jsdoc.conf.json"
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-jsdoc');
    
    grunt.registerTask('default', []);

    grunt.registerTask('doc', ['jsdoc']);
};