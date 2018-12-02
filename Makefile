# Author: Satish Gaikwad <satish@satishweb.com>

VALID_ENV_NAMES="dev|qa|stg|uat|pp|prod"
VALID_ACTIONS="deploy|rm"
DOCKER_HOST?=tcp://localhost:2375/
SERVICES=$(shell ls services|tr '\n' ' ')
Q?=@

# Default domain is com.
DOMAIN?=com
SUBDOMAIN?=satishweb
AWS_ACCESS_KEY_ID?=$(shell echo $$AWS_ACCESS_KEY_ID)

.PHONY: all run npmupdate clean launch build ${SERVICES}

test:
	echo ${AWS_ACCESS_KEY_ID}

all: clean build-all

check-all: check_domain check_awscreds

clean:
	$(Q)rm -rf dist/*

npm-install:
	$(Q)npm install


# Validations
check_domain:
ifndef SERVICE
	$(Q)echo "| ERR: SERVICE is missing. Please run make command with params: SERVICE=NAME-OF-THE-APP"
	exit 1
endif

check_awscreds:
ifndef AWS_ACCESS_KEY_ID
	$(Q)echo "| ERR: AWS_ACCESS_KEY_ID is not set as environment variable OR it is not provided as input parameter to make command."
	$(Q)echo "|      e.g. make deploy AWS_ACCESS_KEY_ID=KGKJHGJGKJGKJGKJ"
	$(Q)echo "|      e.g. export AWS_ACCESS_KEY_ID=KGKJHGJGKJGKJGKJ ; make deploy"
	exit 1
endif
ifndef AWS_SECRET_ACCESS_KEY
	$(Q)echo "| ERR: AWS_SECRET_ACCESS_KEY is not set as environment variable OR it is not provided as input parameter to make command."
	$(Q)echo "|      e.g. make deploy AWS_SECRET_ACCESS_KEY=KJGJIIUSJDKJSGJKDGJSKDGKJSDG"
	$(Q)echo "|      e.g. export AWS_SECRET_ACCESS_KEY=KJGJIIUSJDKJSGJKDGJSKDGKJSDG ; make deploy"
	exit 1
endif
ifndef AWS_REGION
	$(Q)echo "| ERR: AWS_REGION is not set as environment variable OR it is not provided as input parameter to make command."
	$(Q)echo "|      e.g. make deploy AWS_REGION=us-east-1"
	$(Q)echo "|      e.g. export AWS_REGION=us-east-1 ; make deploy"
	exit 1
endif

check_awsr53zone: check_awscreds
ifndef AWS_HOSTED_ZONE_ID
	$(Q)echo "| ERR: AWS_HOSTED_ZONE_ID is not set as environment variable OR it is not provided as input parameter to make command."
	$(Q)echo "|      e.g. make deploy AWS_HOSTED_ZONE_ID=KGKJHGJGKJGKJGKJ"
	$(Q)echo "|      e.g. export AWS_HOSTED_ZONE_ID=KGKJHGJGKJGKJGKJ ; make deploy"
	exit 1
endif