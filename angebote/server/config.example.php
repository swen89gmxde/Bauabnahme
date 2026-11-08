<?php
// Save as config.php OUTSIDE DOCUMENT_ROOT. Never commit credentials or customer data.
return [
    'origin' => 'https://www.sichtwerk-neubauer.de',
    'password_hash' => 'REPLACE_WITH_A_PASSWORD_HASH_CREATED_BY_PHP',
    'data_dir' => '/ABSOLUTE/PRIVATE/PATH/sichtwerk-signieren-data',
    'lifetime_days' => 14,
    // Keep false until the protected setup and complete archive tests are finished.
    'releases_enabled' => false,
    // Captured for each new release; existing releases keep their original policy.
    'archive_mode' => 'signed_pdf_only',
    // New completed archives notify the owner through the STRATO PHP mail service.
    // A successful handoff is not proof of inbox delivery. No PDF/signature is mailed.
    'completion_notification' => [
        'enabled' => true,
        'to' => 'sichtwerk.neubauer@gmx.de',
        'from' => 'info@sichtwerk-neubauer.de',
    ],
    // Mandatory before customer releases. OAuth credentials stay in this private file.
    // Use a private, app-authorized Drive folder; never an 'anyone with link' folder.
    'drive_archive' => [
        'folder_id' => '',
        'client_id' => '',
        'client_secret' => '',
        'refresh_token' => '',
        'batch_size' => 2,
    ],
];
