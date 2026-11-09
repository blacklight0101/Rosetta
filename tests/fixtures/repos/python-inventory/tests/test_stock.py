import pytest

from inventory.stock import receive_goods


def test_receiving_zero_goods_is_refused():
    with pytest.raises(ValueError):
        receive_goods(1, 0)
