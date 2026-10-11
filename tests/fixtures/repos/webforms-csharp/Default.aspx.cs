using System;
using ShopWeb.Services;

namespace ShopWeb
{
    public partial class DefaultPage : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            CatalogGrid.DataSource = new CatalogService().List();
            CatalogGrid.DataBind();
        }
    }
}
