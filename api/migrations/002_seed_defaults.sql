-- +goose Up
-- +goose StatementBegin

-- Default color palette
INSERT INTO app_settings (key, value) VALUES (
    'color_palette',
    '{
        "primary": "#e26729",
        "primaryDark": "#c4551f",
        "background": "#303030",
        "surface": "#f4f4f4",
        "surfaceAlt": "#efefef",
        "textPrimary": "#000000",
        "textSecondary": "#818181",
        "textOnPrimary": "#ffffff",
        "textOnDark": "#ffffff",
        "border": "#cccccc",
        "error": "#b20101",
        "warning": "#FAE55F",
        "success": "#2d8a4e",
        "info": "#5bbad5",
        "navBackground": "#303030",
        "navText": "#ffffff",
        "buttonPrimary": "#e26729",
        "buttonSecondary": "#818181"
    }'::jsonb
);

-- Default app settings
INSERT INTO app_settings (key, value) VALUES
    ('app_name', '"Rncasp"'::jsonb),
    ('registration_enabled', 'true'::jsonb),
    ('default_language', '"en"'::jsonb);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM app_settings WHERE key IN ('color_palette', 'app_name', 'registration_enabled', 'default_language');
-- +goose StatementEnd
