/**
 * plugins/vuetify.js
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Composables
import { createVuetify } from 'vuetify'

const nabangaLight = {
    dark: false,
    colors: {
        background: "#FFFFFF",
        surface: "#FFFFFF",
        "on-surface": "#232323",
        primary: '#3b4997', //blue
        //primary: '#3f7d54', //green
        //primary: '#b92121', //red
        //primary: '#991639', //bordo
        secondary: '#991639',
        error: '#d9042b',
        info: '#2196F3',
        success: '#4CAF50',
        warning: '#FB8C00',
    }
}

const nabangaDark = {
    dark: true,
    colors: {
        background: "#15202b",
        surface: "#15202b",
        "on-surface": "#c9c9c9",
        //primary: "#596cc9",
        //secondary: "#bdc7fb",
        primary: "#bdc7fb",
        error: "#d9042b",
        info: "#2196F3",
        success: "#00af50",
        warning: "#FB8C00",
    },
};

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
    theme: {
        defaultTheme: "nabangaLight",
        themes: {
            nabangaLight,
            nabangaDark,
        },
    },
});

/*
https://blog.logrocket.com/building-dynamic-vuetify-themes/
theme: {
    defaultTheme: "customLightTheme",
    themes: {
        customLightTheme: nabangaTheme,
    },
},
*/