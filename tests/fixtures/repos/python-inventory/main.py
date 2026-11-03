"""Entry point of the stock-keeping web service."""

from flask import Flask, jsonify

from inventory.stock import low_stock_items, receive_goods

app = Flask(__name__)


@app.get("/items/low")
def low_items():
    return jsonify(low_stock_items(threshold=5))


@app.post("/items/<int:item_id>/receive/<int:quantity>")
def receive(item_id, quantity):
    return jsonify({"on_hand": receive_goods(item_id, quantity)})


if __name__ == "__main__":
    app.run(port=8000)
