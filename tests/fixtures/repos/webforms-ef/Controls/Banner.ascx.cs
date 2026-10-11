namespace ShopWeb.Controls
{
    public partial class Banner : System.Web.UI.UserControl
    {
        public string Text
        {
            get { return Message.Text; }
            set { Message.Text = value; }
        }
    }
}
