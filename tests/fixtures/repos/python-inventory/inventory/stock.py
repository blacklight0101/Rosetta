"""Stock rules: what counts as low stock and what receiving goods does."""

from inventory.db import connect, fetch_all


def low_stock_items(threshold):
    rows = fetch_all(
        "SELECT id, name, on_hand FROM items WHERE on_hand < %s ORDER BY name",
        (threshold,),
    )
    return [{"id": row[0], "name": row[1], "on_hand": row[2]} for row in rows]


def receive_goods(item_id, quantity):
    if quantity <= 0:
        raise ValueError("The quantity received must be positive.")
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            "UPDATE items SET on_hand = on_hand + %s WHERE id = %s RETURNING on_hand",
            (quantity, item_id),
        )
        return cursor.fetchone()[0]
