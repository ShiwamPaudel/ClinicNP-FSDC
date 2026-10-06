-- 0005_item_shape.sql — the item's visual form for the pictorial unit picker.
-- Chosen when the item is created; drives the SVG art shown at the counter.
ALTER TABLE items ADD COLUMN shape TEXT NOT NULL DEFAULT 'tablet';
