using System;
using ShopWeb.Services;

namespace ShopWeb.Catalog
{
    public partial class Details : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            var item = new CatalogService().Get(int.Parse(Request["id"]));
            NameLabel.Text = item.Name;
            PriceLabel.Text = item.Price.ToString("C");
        }

        protected void AddButton_Click(object sender, EventArgs e)
        {
            if (!Page.IsValid) return;
            Session["Basket"] = new OrderService().AddToBasket(Session["Basket"], int.Parse(Request["id"]), int.Parse(QuantityBox.Text));
            Response.Redirect("~/Orders/Checkout.aspx");
        }
    }
}
