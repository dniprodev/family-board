WITH ranked_items AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY page_id
      ORDER BY created_at DESC, position DESC, id DESC
    ) - 1 AS next_position
  FROM link_items
)
UPDATE link_items
SET position = (
  SELECT next_position
  FROM ranked_items
  WHERE ranked_items.id = link_items.id
);
