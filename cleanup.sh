#!/bin/bash

cleanDir() {
	rm -rf index.js translations.json shared*
}
rm -rf containers/*
cd services/api/
rm -rf index.js translations.json shared* api/email api/authentication api/bootstrap api/invitations api/teams api/ugrp api/projects
cd ../email && cleanDir
cd ../authentication && cleanDir
cd ../invitations && cleanDir
cd ../teams && cleanDir
cd ../ugrp && cleanDir
cd ../projects && cleanDir
cd ../jobs && cleanDir
