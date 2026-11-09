"""Database access: one connection per call, plain SQL."""

import os

import psycopg2


def connect():
    return psycopg2.connect(os.environ["INVENTORY_DATABASE_URL"])


def fetch_all(sql, params=()):
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()
