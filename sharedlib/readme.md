~~Provides~~ configurable output message in multiple languages and formats the response structure.
The message depends on the response code used and additional arguments need to be passed where substitutions are expected.

### Steps:

1. Require the formatter class.

  ```javascript
  var outputFormatter = require(<path of formatter file>);
  ```

2. Instantiate the class by invoking the constructor with 2 optional arguments - path of the translations file and locale to be used.

  syntax:
  ```javascript
  new <required variable name>( <path of folder containing translations file/s>, <locale> )
  ```
    
  eg.
  ```javascript
  var formatter = new outputFormatter();  // default values
    
  or
    
  var formatter = new outputFormatter( './outputFormats/' , 'en' );  // supplying optional arguments
  ```
  If no values are provided, the default values are used. The locale is set to English("en") and the default translations file found in outputFormatter's directory is used.
  **If the values are provided, the folder must contain the file named "translations.json" in the same directory or sub-directories and the locale key must be present in the translations file.**
  The structure of the translations file is given below, or you can refer to the default "translations.json".

3. When ever sending back the response, call the format function of the object by passing successStatus, messageCode, responseDataObject if any and substitution arguments for the output message.
    
  syntax:
  ```javascript
  formatter.format( <successStatus>, <messageCode>, <responseDataObject>, <messageArgs> );
  ```
  eg.
  ```javascript
  formatter.format( true, 2040, data, 'Reviews' ); // where data is the response data object.
  ```
  or
  ```javascript
  formatter.format( false, 1040, null, 'user_id'); // if no responseDataObject present, but messageArgs are required.
  ```

4. The function returns the formatted response with the message.

  response structure:
  ```javascript
  {
    success: <boolean>, //eg. true
    message: {
      code: <messageCode>, // eg. 2040
      description: <message> // eg. "Records fetched successfully"
    },
      content: <data> // eg. { id: .....}
  }
  ```

5. Similarly use for email messages

  syntax:
  ```javascript
  formatter.email(<messageCode>, <messageArgs> );
  ```
  eg.
  ```javascript
  formatter.email( 'InvitationMail', userName, userEmail );
  ```

### Translations.json:

The file **must** be named **translations.json**.

Format:

```javascript
{
  <messageCode>:{
    <locale1>: <message with $[#] for substitutions>,
    <locale2>: <message with $[#] for substitutions>
  }
}
```
and for emails:

```javascript
{
  <emailFormatName>:{
    <locale1>: <HTML formatted email/subject with HTML tags and $[#] for substitutions>,
    <locale2>: <HTML formatted email/subject with HTML tags and $[#] for substitutions>,
  }
}
```

eg.:

```javascript
{
  "OrderConfirmationSubject": {
    "en": "Order Confirmation!"
  },
  "OrderConfirmationMail": {
    "en": "<p>Dear $[1],<p>Thank you for your recent purchase.<br><br><B>Transaction number:</b> $[2]<br><b>Amount:</b> $$[3]<br><b>Payment Mode:</b> $[4]<br><b>Payment Status:</b> $[5]<br><br>If there are any questions about this transaction, please contact customer service at support@example.com.<p>Sincerely,<br>Example Team."
  },
  "100": {
    "en": "$[1]",
    "es": "$[1]"
  },
  "1130": {
    "en": "Invalid $[1] format. We support only $[2] file types.",
    "es": "Formato $[1] no válido. Se admiten sólo los tipos $[2]."  // from Google Translate
  },
  "102": {
    "en": "Something went wrong.",
    "es": "Algo salió mal." // from Google Translate
  }
}
```