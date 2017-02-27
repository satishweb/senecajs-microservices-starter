#!/bin/bash
rm -rf containers/*
cd services/api/
rm -rf index.js translations.json shared* api/email api/authentication api/bootstrap api/invitations api/teams api/ugrp
cd ../email
rm -rf index.js translations.json shared*
cd ../authentication
rm -rf index.js translations.json shared*
cd ../invitations
rm -rf index.js translations.json shared*
cd ../teams
rm -rf index.js translations.json shared*
cd ../ugrp
rm -rf index.js translations.json shared*