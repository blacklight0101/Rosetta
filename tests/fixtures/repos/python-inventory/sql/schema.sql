CREATE TABLE items (id SERIAL PRIMARY KEY, name TEXT NOT NULL, on_hand INTEGER NOT NULL DEFAULT 0);
INSERT INTO items (name, on_hand) VALUES ('Brass hinge', 3), ('Oak shelf', 12);
