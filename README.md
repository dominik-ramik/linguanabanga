# LinguaNabanga

LinguaNabanga is a web application for building and browsing multilingual, project-based dictionaries. It loads structured data from JSON, supports Markdown content, and provides fast text search with configurable fuzziness.

The app can work offline (PWA) and supports flexible data types and presentation, including multimedia.

## Data format
Content is kept in a simple Excel spreadsheet (XLSX) and a folder structure for media files (images, audio). This makes it easy to author, review, and version data without a database or CMS. You can compile the spreadsheet and folders into a single data.json with the built-in importer, and the app will load it at runtime.

## Reference implementation
A live reference implementation is available at https://dictionary.pvnh.net/linguanabanga

## Author
Developed and maintained by Dominik M. Ramík — https://dominicweb.eu