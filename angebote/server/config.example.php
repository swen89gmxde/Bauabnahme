<?php
// Save as config.php OUTSIDE DOCUMENT_ROOT. Never commit credentials or customer data.
return [
    'origin' => 'https://www.sichtwerk-neubauer.de',
    'password_hash' => 'REPLACE_WITH_A_PASSWORD_HASH_CREATED_BY_PHP',
    'data_dir' => '/ABSOLUTE/PRIVATE/PATH/sichtwerk-signieren-data',
    'lifetime_days' => 14,
];
