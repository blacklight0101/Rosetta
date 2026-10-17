using System;

namespace ShopWeb.Orders
{
    public partial class Confirm : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            NumberLabel.Text = "Order " + Request["number"] + " received";
        }
    }
}
