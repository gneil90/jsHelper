//
//  ViewController.swift
//  jsHelper
//
//  Created by Neil Galiaskarov on 3/4/16.
//  Copyright © 2016 helper. All rights reserved.
//

import UIKit

class ViewController: UIViewController {
  @IBOutlet weak var webView:UIWebView?
  override func viewDidLoad() {
    super.viewDidLoad()
    // Do any additional setup after loading the view, typically from a nib.
    
    let path = NSBundle.mainBundle().pathForResource("index", ofType: "html", inDirectory: "epub.js-0.3/examples")
    var htmlString:NSString?
    do {
      htmlString = try NSString(contentsOfFile: path!, encoding: NSUTF8StringEncoding)
    } catch {
      
    }
    
    if (htmlString != nil) {
      let bundlePath = NSBundle.mainBundle().bundlePath;
      let baseURLPath = (path! as NSString).stringByDeletingLastPathComponent;
      
      let baseURL = NSURL(fileURLWithPath: baseURLPath)
      webView?.loadHTMLString(htmlString! as String, baseURL: baseURL)
    }
  }

  override func didReceiveMemoryWarning() {
    super.didReceiveMemoryWarning()
    // Dispose of any resources that can be recreated.
  }


}

