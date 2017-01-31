#!/bin/bash
rm -rf containers/*
cd services/api/
rm -rf index.js translations.json shared* api/email api/authentication api/bootstrap api/invitations api/organizations api/ugrp
cd ../email
rm -rf index.js translations.json shared*
cd ../authentication
rm -rf index.js translations.json shared*
cd ../invitations
rm -rf index.js translations.json shared*
cd ../organizations
rm -rf index.js translations.json shared*
cd ../ugrp
rm -rf index.js translations.json shared*