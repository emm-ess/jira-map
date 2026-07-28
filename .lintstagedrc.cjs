module.exports = {
    // lint JS/TS-Code
    '*.(js?(x)|ts?(x)|mjs|cjs|vue|json|yml)': ['prettier --write', 'eslint --cache --fix'],
    // run tests
    // '*.(js?(x)|ts?(x)|mjs|cjs|vue|json)': 'jest --passWithNoTests --findRelatedTests',
    // check-types
    '(package-lock.json|*.ts?(x))': () => 'npm run type-check',
    // lint styles
    '*.(vue|htm|html|scss|styl)': 'stylelint --cache --fix --quiet-deprecation-warnings',
    // optimize images
    // '*.{png,jpeg,jpg,gif,svg}': 'imagemin-lint-staged',
    // lint everything, if dependencies got updated
    'package-lock.json': () => 'npm run lint',
}
