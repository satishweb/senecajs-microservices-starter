#!/bin/bash
# Version: 1.0.5
configTmplFile=config/defaults.tmpl.json
configFile=config/defaults.json
srcFolder=$(dirname "${BASH_SOURCE[0]}")
cd $srcFolder
srcFolder=`pwd`
export osv=$(uname|awk '{ print $1 }')
[[ "$osv" == "Darwin" ]] && export sedInplaceReplaceCmd="sed -i '' " || export sedInplaceReplaceCmd="sed -i "
if [[ "$1" == "clean" ]]
 then
    echo "WARN: Cleaning yaml/*"
    rm -rf yaml/* && mkdir -p yaml
    cp -f $configTmplFile $configFile
    $sedInplaceReplaceCmd '/"exampleFiles":/d' $configFile
    echo -n "  \"exampleFiles\": [ " >> $configFile
    find ../../services -type f -name "*.yaml" -exec cp -rf {} yaml/ \;
    cd yaml
    rm -rf PetStore*
    find . -name "*yaml" -execdir echo '{}' ';' >../list
    $sedInplaceReplaceCmd 's/.\///g' ../list
    cd ..
    first=1
    for i in $(cat list)
    do
      $sedInplaceReplaceCmd 's/in: headers/in: header/g' yaml/$i
      if [[ "$first" == "1" ]]
       then
          yamlFiles=$(echo "\"$i\"")
          first=0
       else
          yamlFiles=$(echo "$yamlFiles, \"$i\"")
      fi
    done
    echo -n $yamlFiles >> $configFile
    echo " ]" >> $configFile
    echo "}" >> $configFile
    rm -rf list* yaml/*\'
 else
    echo "INFO: Will abort rebuilding if dist/bunble.js is present"
fi
[[ ! -f dist/bundle.js ]] && npm install && npm run build
exit 0
