# Public Configuration
-----------
> This is mainly used by frontend clients such as frontend webapps detached from the backend, mobile apps. This provides flexibility to operations team in managing the endpoints without releasing new app versions

# Notes
---------
- devices.config.json is used by all mobile app platforms
- app.config.json is used by all webapps run inside browser. Callback mechanism is used to avoid CORS errors.
- These config files are 