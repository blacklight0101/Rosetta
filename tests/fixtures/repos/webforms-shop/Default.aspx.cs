using System;
using System.Web.UI.WebControls;
using ShopWeb.Services;

namespace ShopWeb
{
    public partial class DefaultPage : System.Web.UI.Page
    {
        protected void Page_Load(object sender, EventArgs e)
        {
            if (!IsPostBack) BindGrid(string.Empty);
        }

        protected void SearchButton_Click(object sender, EventArgs e)
        {
            BindGrid(SearchBox.Text.Trim());
        }

        protected void CatalogGrid_RowCommand(object sender, GridViewCommandEventArgs e)
        {
            if (e.CommandName == "Details") Response.Redirect("~/Catalog/Details.aspx?id=" + e.CommandArgument);
        }

        private void BindGrid(string term)
        {
            CatalogGrid.DataSource = new CatalogService().Find(term);
            CatalogGrid.DataBind();
        }
    }
}
