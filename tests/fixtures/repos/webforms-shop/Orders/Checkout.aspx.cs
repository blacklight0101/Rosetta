using System;
using ShopWeb.Services;

namespace ShopWeb.Orders
{
    public partial class Checkout : System.Web.UI.Page
    {
        protected void PlaceButton_Click(object sender, EventArgs e)
        {
            if (!Page.IsValid) return;
            var basket = Session["Basket"];
            if (basket == null) Response.Redirect("~/Default.aspx");
            var number = new OrderService().Place(EmailBox.Text, ShippingList.SelectedValue, basket);
            Session["Basket"] = null;
            Response.Redirect("~/Orders/Confirm.aspx?number=" + number);
        }
    }
}
