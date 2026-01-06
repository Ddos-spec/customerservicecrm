const globals = require('globals');
const js = require('@eslint/js');

module.exports = [
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.es2021,
                ...globals.jest, // Tambahkan Jest Globals
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'off',
            'no-undef': 'error',
            'no-console': 'off',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { avoidEscape: true }],
            'no-useless-escape': 'off', // Regex complex sering kena ini, kita matikan saja biar aman
            'no-case-declarations': 'off', // Izinkan deklarasi variabel di switch case
            'no-empty': 'warn'
        }
    }
];